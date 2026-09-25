<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Settings → Audit History. Read-only, Admin-only.
 *
 * Every route reaching this controller is behind
 * `permission:AUDIT_VIEW` in routes/api.php, which only the Admin role holds
 * (see RoleSeeder) — a Manager hitting `/api/audit-logs` directly, with a
 * valid token and no browser involved, gets a 403 from the middleware before
 * any code here runs. The frontend's hidden menu item is a courtesy on top of
 * that, never the control itself.
 *
 * There is no store/update/destroy, by design: audit records are immutable
 * (App\Models\AuditLog enforces that at the model level too) and there is no
 * endpoint through which anyone — Admin included — can alter history.
 */
class AuditLogController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    /** Paginated, newest first. Audit history only grows, so it is never returned whole. */
    public function index(Request $request)
    {
        $perPage = min(max($request->integer('per_page') ?: 25, 5), 100);

        $logs = $this->filtered($request)
            ->with('performedBy:id,name')
            ->orderByDesc('performed_at')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString();

        return response()->json([
            'data' => collect($logs->items())->map(fn (AuditLog $log) => $this->presentRow($log)),
            'meta' => [
                'current_page' => $logs->currentPage(),
                'last_page' => $logs->lastPage(),
                'per_page' => $logs->perPage(),
                'total' => $logs->total(),
            ],
        ]);
    }

    /**
     * The options every filter dropdown needs, from what has actually been
     * recorded rather than from the full constant lists — an empty history
     * should not offer twenty modules to filter by.
     */
    public function filters()
    {
        return response()->json([
            'users' => User::whereIn('id', AuditLog::query()->distinct()->pluck('performed_by_user_id')->filter())
                ->orderBy('name')->get(['id', 'name'])
                ->map(fn (User $u) => ['id' => (string) $u->id, 'name' => $u->name])
                ->values(),
            'actions' => AuditLog::query()->distinct()->orderBy('action')->pluck('action')->values(),
            'modules' => AuditLog::query()->distinct()->orderBy('module')->pluck('module')->values(),
            'all_actions' => AuditAction::all(),
            'all_modules' => array_values(array_unique(array_values(AuditEntity::MODULES))),
        ]);
    }

    /**
     * One event in full — including the before/after values (§12).
     *
     * The record is looked up here rather than through route-model binding on
     * purpose. Laravel substitutes bindings early in the middleware stack, so
     * a bound parameter would 404 on a missing id *before* the permission
     * middleware refuses the caller — telling a Manager probing ids apart
     * which audit records exist. Resolving it inside the controller means the
     * 403 always comes first, and every id looks identical from outside.
     */
    public function show(int $auditLog)
    {
        $log = AuditLog::with('performedBy:id,name')->findOrFail($auditLog);

        return response()->json($this->presentDetail($log));
    }

    /** The current filter's results as CSV. Before/after are summarised, not dumped. */
    public function export(Request $request): StreamedResponse
    {
        $query = $this->filtered($request)->with('performedBy:id,name')
            ->orderByDesc('performed_at')->orderByDesc('id');

        $filename = 'audit-history-'.now()->format('Y-m-d').'.csv';

        return response()->streamDownload(function () use ($query) {
            $handle = fopen('php://output', 'w');
            // BOM, so Excel opens the ৳ amounts and Bengali names correctly.
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, ['Date/Time', 'User', 'Action', 'Module', 'Record', 'Summary', 'Reason', 'Changed fields']);

            $query->chunk(500, function ($logs) use ($handle) {
                foreach ($logs as $log) {
                    fputcsv($handle, [
                        $log->performed_at?->format('d M Y H:i'),
                        $log->performed_by_user_name,
                        $log->action,
                        $log->module,
                        $log->record_label,
                        $log->summary,
                        $log->reason,
                        implode(', ', $this->audit->changedKeys($log->before_data, $log->after_data)),
                    ]);
                }
            });

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /** @return Builder<AuditLog> */
    private function filtered(Request $request): Builder
    {
        return AuditLog::query()
            ->when($request->filled('user_id'), fn (Builder $q) => $q->where('performed_by_user_id', $request->integer('user_id')))
            ->when($request->filled('action'), fn (Builder $q) => $q->where('action', $request->string('action')))
            ->when($request->filled('module'), fn (Builder $q) => $q->where('module', $request->string('module')))
            ->when($request->filled('entity_type'), fn (Builder $q) => $q->where('entity_type', $request->string('entity_type')))
            ->when($request->filled('entity_id'), fn (Builder $q) => $q->where('entity_id', (string) $request->string('entity_id')))
            ->when($request->filled('from'), fn (Builder $q) => $q->where('performed_at', '>=', $request->date('from')?->startOfDay()))
            ->when($request->filled('to'), fn (Builder $q) => $q->where('performed_at', '<=', $request->date('to')?->endOfDay()))
            ->when($request->filled('search'), function (Builder $q) use ($request) {
                $term = '%'.$request->string('search').'%';
                $q->where(fn (Builder $inner) => $inner
                    ->where('record_label', 'like', $term)
                    ->orWhere('summary', 'like', $term)
                    ->orWhere('reason', 'like', $term)
                    ->orWhere('performed_by_user_name', 'like', $term)
                    ->orWhere('module', 'like', $term));
            });
    }

    /** The table row — no before/after payload, so a listing stays small. */
    private function presentRow(AuditLog $log): array
    {
        return [
            'id' => (string) $log->id,
            'performedAt' => $log->performed_at?->toIso8601String(),
            'performedByUserId' => $log->performed_by_user_id ? (string) $log->performed_by_user_id : null,
            'performedByUserName' => $log->performed_by_user_name,
            'action' => $log->action,
            'module' => $log->module,
            'entityType' => $log->entity_type,
            'entityId' => $log->entity_id,
            'record' => $log->record_label,
            'summary' => $log->summary,
            'reason' => $log->reason,
            'hasChanges' => $log->before_data !== null || $log->after_data !== null,
        ];
    }

    private function presentDetail(AuditLog $log): array
    {
        return array_merge($this->presentRow($log), [
            'before' => $log->before_data,
            'after' => $log->after_data,
            'changedFields' => $this->audit->changedKeys($log->before_data, $log->after_data),
            'metadata' => $log->metadata,
            'ipAddress' => $log->ip_address,
        ]);
    }
}
