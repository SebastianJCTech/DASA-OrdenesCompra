# Modelo de datos

```mermaid
erDiagram
 AUTH_USERS ||--o| PROFILES : tiene
 PROFILES ||--o{ ORDERS : crea
 PROFILES ||--o{ ORDERS : aprobador_asignado
 ORDERS ||--o{ APPROVALS : recibe
 PROFILES ||--o{ APPROVALS : decide
 ORDERS ||--o{ AUDIT_LOG : registra_id_historico
 PROFILES ||--o{ AUDIT_LOG : actor_id_historico
 PROFILES {
  uuid id PK,FK
  text name
  text role
  numeric approval_limit
 }
 ORDERS {
  bigint id PK
  uuid creator_id FK
  uuid approver_id FK
  text supplier
  text department
  text description
  numeric amount
  text currency
  text status
  date due_date
  timestamptz submitted_at
  timestamptz decided_at
  text reason
  timestamptz created_at
  timestamptz updated_at
 }
 APPROVALS {
  bigint id PK
  bigint order_id FK
  uuid approver_id FK
  text decision
  text reason
  numeric limit_snapshot
  timestamptz decided_at
 }
 AUDIT_LOG {
  bigint id PK
  bigint order_id
  uuid actor_id
  text operation
  jsonb old_values
  jsonb new_values
  timestamptz occurred_at
 }
```

audit_log conserva identificadores históricos sin FK para mantener la evidencia cuando se elimina un borrador. Las dos relaciones al log son lógicas. Cada usuario puede decidir una sola vez por orden. Los perfiles se provisionan de forma administrativa después de crear el usuario en Auth.
