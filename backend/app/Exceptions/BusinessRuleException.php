<?php

namespace App\Exceptions;

use Exception;

/** Generic guard-rail violation (e.g. deleting a system account, double-closing a month). */
class BusinessRuleException extends Exception
{
    //
}
