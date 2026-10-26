# Order processing protocol — draft

## Scenario and scope

A third-party supplier sends order documents that are syntactically valid JSON but sometimes contain inconsistent types, formatting, or missing business data. Build an adapter that accepts documented repairs and forwards only valid canonical orders. Never guess an ambiguous value.

Use your language's standard JSON library. No custom JSON parser, network client, or external service is required. This draft defines a future challenge; no harness exists yet.

## Transport and input guarantees

The proposed transport is UTF-8 JSONL: one request per stdin line, one response per stdout line, and a final newline after each response. Keep the process alive until stdin EOF; requests are independent. Send diagnostics to stderr. Pretty-printed examples below illustrate documents; actual wire messages occupy one line.

Every request envelope has exactly requestId and order. requestId is a nonempty ASCII string and order is a JSON object. These envelope guarantees need no validation. Inside order, owned fields may be missing, null, incorrectly typed, or invalid according to the rules below. Empty arrays are syntactically valid; positions must contain at least one item.

JSON syntax is always valid, object member names are unique, and strings are well-formed Unicode. Numeric values have absolute value at most 9007199254740991; integer values are exactly representable within that range. Non-integer numeric inputs have at most six fractional decimal places by mathematical value. NaN and Infinity never occur. There are no requirements to preserve numeric spelling, whitespace, or object member order.

## Canonical order model

All listed fields are required unless marked optional. A required field cannot be null. An object must be a JSON object, excluding arrays and null. Strings must not be coerced unless a repair rule explicitly permits it.

| Path relative to order | Canonical value |
| --- | --- |
| orderId | Nonempty ASCII string; preserve exactly, including spaces |
| kind | Exactly physical or digital; case sensitive |
| currency | Exactly EUR, USD, or GBP |
| express | Boolean |
| positions | Nonempty array of position objects |
| positions[i].positionId | Nonempty ASCII string, unique within this order; preserve exactly |
| positions[i].sku | Nonempty ASCII string; preserve exactly |
| positions[i].quantity | Decimal digit string representing an integer from 1 through 1000, without leading zeroes |
| positions[i].unitPrice | Decimal string from 0.00 through 999999.99, with exactly two fractional digits and no redundant leading zeroes |
| deliveryInstructions | Optional nonempty string after trimming; omit when empty or null |
| shippingAddress | Required object for physical orders; forbidden for digital orders |
| shippingAddress.line1 | Nonempty string, preserved exactly |
| shippingAddress.city | Nonempty string, preserved exactly |
| shippingAddress.postalCode | Nonempty string, preserved exactly |
| shippingAddress.country | Exactly DE, FR, GB, or US; this deliberately small list is the whole assessment domain |
| recipient | Required object for digital orders; forbidden for physical orders |
| recipient.email | Email string satisfying the limited rule below |

NOTES: A string containing only spaces is nonempty unless a field has an explicit trimming rule. All positions in an order share its kind and currency. No product catalog, tax, stock, address-format, or price-total validation is required. Unknown fields are permitted and must be preserved.

## Seven repair families

Trim means remove only ASCII space, tab, carriage return, and line feed from both ends. Case conversion affects ASCII letters only. No other implicit conversions are allowed. For each field, apply its entire rule and record at most one repair from the original value to the final value.

| Rule ID | Field | Accepted input and required normalization |
| --- | --- | --- |
| QUANTITY | positions[i].quantity | A JSON integer from 1 through 1000, or a string that becomes one or more ASCII digits after trimming and represents that range. Produce the canonical digit string. Examples: 3 → "3"; " 003 " → "3". Reject null, booleans, fractions, signs, decimal strings such as "3.0", and out-of-range values. |
| UNIT_PRICE | positions[i].unitPrice | A JSON number in range whose mathematical value has at most two fractional decimal places, or a trimmed string matching ASCII digits optionally followed by a dot and one or two digits. Produce exactly two fractional digits. Examples: 12.5 → "12.50"; " 0012.5 " → "12.50"; "0" → "0.00". Reject negatives, null, booleans, comma separators, signed strings, exponent strings, and more than two fractional digits in strings. Never round. |
| CURRENCY | currency | A string that becomes EUR, USD, or GBP after trimming and uppercasing. Example: " eur " → "EUR". Other values fail validation. |
| EXPRESS | express | A boolean, or a string that becomes true or false after trimming and lowercasing. Convert strings to booleans. Examples: " FALSE " → false; true stays true. Reject numbers, null, and strings such as "yes". |
| COUNTRY | shippingAddress.country | A string that becomes DE, FR, GB, or US after trimming and uppercasing. Other values fail validation. Applies only to physical orders. |
| INSTRUCTIONS | deliveryInstructions | Missing stays missing. Remove explicit null. Trim strings; remove the property if the result is empty, otherwise keep the trimmed string. Reject every other type. |
| EMAIL | recipient.email | Trim a string. Require exactly one @, a nonempty local part and domain, and ASCII letters, digits, dot, underscore, plus, or hyphen in either part. Lowercase the domain only. Preserve local-part case. Example: " Buyer@EXAMPLE.COM " → "Buyer@example.com". No dot is required in the domain; this is deliberately not full Internet email validation. Applies only to digital orders. |

A numeric token such as 3.0 or 3e0 is the number 3 and is accepted for quantity; the string "3.0" is not. Numeric values are judged by their decimal mathematical value, not floating-point remainder tests. A unitPrice of 1.005 is rejected rather than rounded. Negative numeric zero is equivalent to zero, so it is accepted for unitPrice and rejected for quantity.

Defaulting is deliberately limited: missing quantity, price, express, or any other required field is an error. Null never means zero, one, false, or an empty required field.

## Preserve unowned data

Return the original order with only the documented replacements or removals. Preserve unknown properties at the order, position, address, and recipient levels, including their nested contents. Unknown data may contain null, objects, arrays, or any standard JSON value. Canonical owned fields are non-null; opaque extension data is allowed to remain null.

Repair only exact owned paths. For example, positions[0].metadata.quantity, supplier.quantity, and shippingAddress.metadata.country must remain untouched. Do not recursively normalize matching property names. Preserve position order. Do not add defaults or drop unknown fields.

Equality is structural JSON equality: object member order and numeric spelling do not matter; array order, string contents, missing properties, and null do matter. Rebuilding the entire order is unnecessary; typed extension data or a JSON tree are both valid strategies.

## Strict response variants

Successful responses have exactly requestId, outcome, order, and repairs. outcome is accepted when no value changed, otherwise repaired. Echo requestId and return the complete canonical order. repairs is always an array, including when empty.

A replacement repair has exactly op, path, rule, before, and after. op is replace. A removal repair has exactly op, path, rule, and before. op is remove; omit after. before is the original JSON value, and after is the final value. Do not record unchanged values or absent optional fields.

Rejected responses have exactly requestId, outcome, and errors. outcome is rejected. errors is a nonempty array of objects with exactly path and code. Do not include order or repairs. Never forward a partially repaired order. Validate independent fields even when other fields fail; errors describe the original document using each field's permitted repairs.

Paths are JSON Pointers rooted at the order, not the request envelope: /positions/0/quantity. Array indices use decimal digits. If a pointer segment contains ~ or /, escape it as ~0 or ~1. All error and repair paths in this draft refer to known fields or array indices.

## Errors and deterministic ordering

Use these codes with this precedence for each owned field:

1. Missing required property → REQUIRED.
2. Forbidden variant property is present, even if null → UNEXPECTED_FIELD. Do not validate inside it.
3. Wrong JSON type, including null unless a repair explicitly permits it → TYPE. Quantity and unitPrice permit strings or numbers; express permits strings or booleans. Arrays and null are not objects.
4. Correct permitted type but an unacceptable value → VALUE. This includes an empty required string, unknown kind, invalid numeric range, unsupported country/currency, or malformed email.
5. A valid positionId equal to an earlier valid positionId → DUPLICATE_ID on the later positionId. IDs compare exactly without trimming or case conversion, even when the earlier position has other errors.

Each field produces at most one error. Invalid containers produce one error at their own path; skip their children. An empty positions array produces VALUE at /positions. An invalid kind produces one error at /kind; skip both variant branches, but still validate all common fields. When kind is valid, validate its required branch and report the opposite branch as forbidden if present.

Traverse fields in exactly this order: orderId, kind, currency, express, positions, deliveryInstructions, shippingAddress, recipient. Inside positions, visit indices ascending and fields positionId, sku, quantity, unitPrice. Inside shippingAddress, visit line1, city, postalCode, country. Inside recipient, visit email.

Append errors and repairs in this traversal order, not input member order and not lexical pointer order. Continue visiting independent fields after a failure. On rejection, discard all candidate repairs. Each successful field contributes at most one repair, even if it needed both trimming and a type or case conversion.

## Complete input/output examples

Each input is followed by its complete response. These examples are normative illustrations for the draft.

### 1. Already canonical

Input:

```json
{
  "requestId": "r-1",
  "order": {
    "orderId": "O-100",
    "kind": "physical",
    "currency": "EUR",
    "express": false,
    "positions": [
      {
        "positionId": "L-1",
        "sku": "BOOK-1",
        "quantity": "2",
        "unitPrice": "12.50"
      }
    ],
    "shippingAddress": {
      "line1": "Main Street 1",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "DE"
    }
  }
}
```

Output:

```json
{
  "requestId": "r-1",
  "outcome": "accepted",
  "order": {
    "orderId": "O-100",
    "kind": "physical",
    "currency": "EUR",
    "express": false,
    "positions": [
      {
        "positionId": "L-1",
        "sku": "BOOK-1",
        "quantity": "2",
        "unitPrice": "12.50"
      }
    ],
    "shippingAddress": {
      "line1": "Main Street 1",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "DE"
    }
  },
  "repairs": []
}
```

### 2. Repair owned fields and preserve extensions

Input:

```json
{
  "requestId": "r-2",
  "order": {
    "orderId": "O-100",
    "kind": "physical",
    "currency": " eur ",
    "express": " FALSE ",
    "positions": [
      {
        "positionId": "L-1",
        "sku": "BOOK-1",
        "quantity": 2,
        "unitPrice": " 0012.5 ",
        "metadata": {
          "quantity": null,
          "unitPrice": "not a price"
        }
      }
    ],
    "shippingAddress": {
      "line1": "Main Street 1",
      "city": "Berlin",
      "postalCode": "10115",
      "country": " de "
    },
    "deliveryInstructions": "   ",
    "supplier": {
      "quantity": "leave me alone",
      "flags": [
        null,
        true
      ]
    }
  }
}
```

Output:

```json
{
  "requestId": "r-2",
  "outcome": "repaired",
  "order": {
    "orderId": "O-100",
    "kind": "physical",
    "currency": "EUR",
    "express": false,
    "positions": [
      {
        "positionId": "L-1",
        "sku": "BOOK-1",
        "quantity": "2",
        "unitPrice": "12.50",
        "metadata": {
          "quantity": null,
          "unitPrice": "not a price"
        }
      }
    ],
    "shippingAddress": {
      "line1": "Main Street 1",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "DE"
    },
    "supplier": {
      "quantity": "leave me alone",
      "flags": [
        null,
        true
      ]
    }
  },
  "repairs": [
    {
      "op": "replace",
      "path": "/currency",
      "rule": "CURRENCY",
      "before": " eur ",
      "after": "EUR"
    },
    {
      "op": "replace",
      "path": "/express",
      "rule": "EXPRESS",
      "before": " FALSE ",
      "after": false
    },
    {
      "op": "replace",
      "path": "/positions/0/quantity",
      "rule": "QUANTITY",
      "before": 2,
      "after": "2"
    },
    {
      "op": "replace",
      "path": "/positions/0/unitPrice",
      "rule": "UNIT_PRICE",
      "before": " 0012.5 ",
      "after": "12.50"
    },
    {
      "op": "remove",
      "path": "/deliveryInstructions",
      "rule": "INSTRUCTIONS",
      "before": "   "
    },
    {
      "op": "replace",
      "path": "/shippingAddress/country",
      "rule": "COUNTRY",
      "before": " de ",
      "after": "DE"
    }
  ]
}
```

### 3. Digital order with optional null removal

Input:

```json
{
  "requestId": "r-3",
  "order": {
    "orderId": "O-200",
    "kind": "digital",
    "currency": "USD",
    "express": false,
    "positions": [
      {
        "positionId": "D-1",
        "sku": "EBOOK",
        "quantity": " 003 ",
        "unitPrice": 0
      }
    ],
    "deliveryInstructions": null,
    "recipient": {
      "email": " Buyer@EXAMPLE.COM ",
      "campaign": {
        "country": "untouched"
      }
    }
  }
}
```

Output:

```json
{
  "requestId": "r-3",
  "outcome": "repaired",
  "order": {
    "orderId": "O-200",
    "kind": "digital",
    "currency": "USD",
    "express": false,
    "positions": [
      {
        "positionId": "D-1",
        "sku": "EBOOK",
        "quantity": "3",
        "unitPrice": "0.00"
      }
    ],
    "recipient": {
      "email": "Buyer@example.com",
      "campaign": {
        "country": "untouched"
      }
    }
  },
  "repairs": [
    {
      "op": "replace",
      "path": "/positions/0/quantity",
      "rule": "QUANTITY",
      "before": " 003 ",
      "after": "3"
    },
    {
      "op": "replace",
      "path": "/positions/0/unitPrice",
      "rule": "UNIT_PRICE",
      "before": 0,
      "after": "0.00"
    },
    {
      "op": "remove",
      "path": "/deliveryInstructions",
      "rule": "INSTRUCTIONS",
      "before": null
    },
    {
      "op": "replace",
      "path": "/recipient/email",
      "rule": "EMAIL",
      "before": " Buyer@EXAMPLE.COM ",
      "after": "Buyer@example.com"
    }
  ]
}
```

### 4. Reject atomically and report independent failures

Input:

```json
{
  "requestId": "r-4",
  "order": {
    "orderId": "O-100",
    "kind": "physical",
    "currency": " eur ",
    "express": false,
    "positions": [
      {
        "positionId": "L-1",
        "sku": "BOOK-1",
        "quantity": null,
        "unitPrice": "1.005"
      },
      {
        "positionId": "L-1",
        "sku": "BOOK-2",
        "quantity": "1",
        "unitPrice": "5.00"
      }
    ],
    "shippingAddress": {
      "line1": "Main Street 1",
      "city": "Berlin",
      "postalCode": "10115",
      "country": "DE"
    },
    "recipient": null
  }
}
```

Output:

```json
{
  "requestId": "r-4",
  "outcome": "rejected",
  "errors": [
    {
      "path": "/positions/0/quantity",
      "code": "TYPE"
    },
    {
      "path": "/positions/0/unitPrice",
      "code": "VALUE"
    },
    {
      "path": "/positions/1/positionId",
      "code": "DUPLICATE_ID"
    },
    {
      "path": "/recipient",
      "code": "UNEXPECTED_FIELD"
    }
  ]
}
```

### 5. Missing field, empty collection, and invalid container

Input:

```json
{
  "requestId": "r-5",
  "order": {
    "orderId": "O-300",
    "kind": "physical",
    "currency": "GBP",
    "positions": [],
    "shippingAddress": null
  }
}
```

Output:

```json
{
  "requestId": "r-5",
  "outcome": "rejected",
  "errors": [
    {
      "path": "/express",
      "code": "REQUIRED"
    },
    {
      "path": "/positions",
      "code": "VALUE"
    },
    {
      "path": "/shippingAddress",
      "code": "TYPE"
    }
  ]
}
```
