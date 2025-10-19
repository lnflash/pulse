# Phase 3: Advanced Payment Features

**Status:** Planned
**Target:** Future Release
**Dependencies:** Phase 1 (Direct Payment Buttons) - Completed

## Overview

Phase 3 introduces three major feature sets to enhance the payment request and invoice experience:

1. **Split Payments** - Allow multiple users to contribute to a single payment request
2. **Templates** - Save and reuse common payment request configurations
3. **Request History** - View, manage, and track all payment requests

---

## Feature 1: Split Payments

### User Story
> "As a user organizing a group dinner, I want to create a payment request that multiple friends can contribute to, so we can easily split the bill."

### Functionality

#### Creating Split Payments
```
/request 5000 sats --split
```
- Creates invoice that accepts multiple partial payments
- Tracks each contributor and their contribution amount
- Shows progress toward target amount
- Automatically completes when target reached

#### Payment Flow
1. Creator makes split payment request
2. Invoice embed shows:
   - Target amount: 5000 sats
   - Current progress: 1500/5000 (30%)
   - Contributors: @alice (1000), @bob (500)
   - "Contribute" button
3. Contributors click button → specify amount → pay
4. Embed updates in real-time
5. Creator notified at milestones (25%, 50%, 75%, 100%)

### Technical Architecture

#### Domain Layer

**New Model: `SplitPayment`**
```rust
pub struct SplitPayment {
    pub id: Uuid,
    pub invoice_id: Uuid,
    pub target_amount_sats: i64,
    pub current_amount_sats: i64,
    pub contributors: Vec<Contribution>,
    pub status: SplitPaymentStatus,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
}

pub struct Contribution {
    pub contributor_id: String,
    pub platform: Platform,
    pub amount_sats: i64,
    pub timestamp: DateTime<Utc>,
    pub payment_hash: String,
}

pub enum SplitPaymentStatus {
    Active,      // Accepting contributions
    Complete,    // Target reached
    Cancelled,   // Manually cancelled
}
```

**Invoice Model Updates:**
```rust
pub struct Invoice {
    // ... existing fields ...
    pub is_split_payment: bool,
    pub split_payment_id: Option<Uuid>,
}
```

#### Application Layer

**New Port: `SplitPaymentRepository`**
```rust
#[async_trait]
pub trait SplitPaymentRepository: Send + Sync {
    async fn save(&self, split_payment: &SplitPayment) -> Result<()>;
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<SplitPayment>>;
    async fn find_by_invoice_id(&self, invoice_id: &Uuid) -> Result<Option<SplitPayment>>;
    async fn add_contribution(&self, id: &Uuid, contribution: Contribution) -> Result<()>;
    async fn update_status(&self, id: &Uuid, status: SplitPaymentStatus) -> Result<()>;
}
```

#### Infrastructure Layer

**Redis Data Structure:**
```
split_payment:{uuid}          -> JSON (SplitPayment metadata)
split_payment:{uuid}:contrib  -> ZSET (contributions by timestamp)
invoice:{uuid}:split          -> STRING (split_payment_id)
```

#### Discord Integration

**Commands:**
- `/request <amount> --split` - Create split payment request
- `/split status <id>` - View split payment details
- `/split cancel <id>` - Cancel active split payment

**UI Updates:**
- Progress bar on invoice embed
- Live contribution list
- Milestone notifications (DM to creator)

---

## Feature 2: Templates

### User Story
> "As a freelancer, I frequently invoice clients for the same amount. I want to save templates so I don't have to type the same details every time."

### Functionality

#### Managing Templates
```
/template create "Weekly Retainer" 50000 sats "Weekly consulting services"
/template list
/template delete "Weekly Retainer"
/template use "Weekly Retainer"
```

#### Template Features
- Name, amount, unit, memo
- Per-user storage (private templates)
- Quick invoice generation from template
- Optional: Recurring templates (daily/weekly/monthly)

### Technical Architecture

#### Domain Layer

**New Model: `PaymentTemplate`**
```rust
pub struct PaymentTemplate {
    pub id: Uuid,
    pub platform: Platform,
    pub creator_id: String,
    pub name: String,
    pub amount_sats: Option<i64>,
    pub unit: String,
    pub memo: Option<String>,
    pub created_at: DateTime<Utc>,
    pub last_used: Option<DateTime<Utc>>,
    pub use_count: u32,
}
```

#### Application Layer

**New Port: `TemplateRepository`**
```rust
#[async_trait]
pub trait TemplateRepository: Send + Sync {
    async fn save(&self, template: &PaymentTemplate) -> Result<()>;
    async fn find_by_id(&self, id: &Uuid) -> Result<Option<PaymentTemplate>>;
    async fn find_by_creator(&self, platform: Platform, creator_id: &str) -> Result<Vec<PaymentTemplate>>;
    async fn find_by_name(&self, platform: Platform, creator_id: &str, name: &str) -> Result<Option<PaymentTemplate>>;
    async fn delete(&self, id: &Uuid) -> Result<()>;
    async fn update_last_used(&self, id: &Uuid) -> Result<()>;
}
```

**Command Handlers:**
- `CreateTemplateHandler`
- `ListTemplatesHandler`
- `DeleteTemplateHandler`
- `UseTemplateHandler`

#### Infrastructure Layer

**Redis Data Structure:**
```
template:{uuid}                              -> JSON (Template data)
template:user:{platform}:{user_id}          -> SET (template IDs)
template:name:{platform}:{user_id}:{name}   -> STRING (template_id)
```

#### Discord Integration

**Commands:**
- `/template create <name> <amount> [memo]`
- `/template list [page]`
- `/template delete <name>`
- `/template use <name>` - Creates invoice from template
- `/request --template <name>` - Shortcut for template use

**UI:**
- Paginated template list
- Template details in embed
- Confirmation before deletion

---

## Feature 3: Request History

### User Story
> "As a user, I want to see all my past payment requests so I can track what I've invoiced and what's been paid."

### Functionality

#### Viewing History
```
/requests                    # All requests, paginated
/requests --status pending   # Only pending requests
/requests --status paid      # Only completed requests
/requests --page 2           # Pagination
```

#### Display Features
- 5 requests per page
- Status indicators (🟢 Paid, 🟡 Pending, 🔴 Expired)
- Amount, creation date, expiry
- Action buttons: "Pay Now", "Cancel", "Details"
- Summary stats: Total requests, total paid, total pending

### Technical Architecture

#### Application Layer Updates

**Enhanced `InvoiceRepository`:**
```rust
#[async_trait]
pub trait InvoiceRepository: Send + Sync {
    // ... existing methods ...

    async fn find_by_creator_paginated(
        &self,
        platform: Platform,
        creator_id: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Invoice>>;

    async fn find_by_creator_filtered(
        &self,
        platform: Platform,
        creator_id: &str,
        status: Option<InvoiceStatus>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Invoice>>;

    async fn count_by_creator(
        &self,
        platform: Platform,
        creator_id: &str,
        status: Option<InvoiceStatus>,
    ) -> Result<usize>;
}
```

**New Handler: `RequestHistoryHandler`**
- Queries invoices with pagination
- Filters by status
- Calculates summary statistics
- Formats response for Discord

#### Infrastructure Layer

**Redis Enhancements:**
```
invoice:creator:{platform}:{user_id}:all      -> ZSET (all invoices by timestamp)
invoice:creator:{platform}:{user_id}:pending  -> ZSET (pending invoices)
invoice:creator:{platform}:{user_id}:paid     -> ZSET (paid invoices)
```

Use `ZRANGE` for efficient pagination:
```
ZRANGE invoice:creator:discord:123:all 0 4 REV WITHSCORES
```

#### Discord Integration

**Commands:**
- `/requests [status] [page]`

**Button Handlers:**
- `history_prev` - Previous page
- `history_next` - Next page
- `invoice_cancel:{uuid}` - Cancel pending invoice
- `invoice_details:{uuid}` - Show full invoice details

**UI:**
```
┌──────────────────────────────────────┐
│ 📊 Your Payment Requests             │
│ Total: 23 | Paid: 15 | Pending: 5    │
├──────────────────────────────────────┤
│ 🟢 1,000 sats - Coffee run           │
│    Paid 2 hours ago                  │
│    [Details]                         │
│                                      │
│ 🟡 5,000 sats - Lunch split          │
│    Created 1 day ago | Expires in 23h│
│    [Pay Now] [Cancel] [Details]      │
│                                      │
│ 🟢 2,500 sats - Book                 │
│    Paid 3 days ago                   │
│    [Details]                         │
├──────────────────────────────────────┤
│ ◀️ Previous | Page 1/5 | Next ▶️     │
└──────────────────────────────────────┘
```

---

## Implementation Priority

### Recommended Order:

1. **Request History** (Simplest)
   - Extends existing infrastructure
   - No new domain models
   - ~4-6 hours development

2. **Templates** (Medium)
   - New domain model + repository
   - Straightforward CRUD operations
   - ~8-10 hours development

3. **Split Payments** (Most Complex)
   - Complex state management
   - Real-time updates
   - Contribution tracking
   - ~12-16 hours development

### Total Estimated Effort: 24-32 hours

---

## Database Schema

### Redis Keys Summary

```
# Invoices (existing + enhanced)
invoice:{uuid}
invoice:hash:{payment_hash}
invoice:creator:{platform}:{user_id}
invoice:creator:{platform}:{user_id}:all       # ZSET for history
invoice:creator:{platform}:{user_id}:pending
invoice:creator:{platform}:{user_id}:paid

# Split Payments
split_payment:{uuid}
split_payment:{uuid}:contrib                   # ZSET
invoice:{uuid}:split

# Templates
template:{uuid}
template:user:{platform}:{user_id}            # SET
template:name:{platform}:{user_id}:{name}
```

---

## API Surface

### New Discord Commands

```
# Split Payments
/request <amount> --split              # Create split payment
/split status <id>                     # View split status
/split cancel <id>                     # Cancel split payment

# Templates
/template create <name> <amount> [memo]
/template list [page]
/template delete <name>
/template use <name>

# Request History
/requests [--status all|pending|paid|expired] [--page N]

# Modified
/request [amount] [--template name] [--split]
```

### New Button Interactions

```
contribute_split:{uuid}               # Contribute to split payment
history_prev:{page}                   # Navigate history backward
history_next:{page}                   # Navigate history forward
invoice_cancel:{uuid}                 # Cancel invoice
invoice_details:{uuid}                # View invoice details
template_delete:{uuid}                # Delete template
```

---

## Migration Notes

### Breaking Changes: None

All changes are additive:
- Existing Invoice model extended with optional fields
- New repositories don't affect existing code
- New commands don't replace existing functionality

### Data Migration: Not Required

- Existing invoices remain functional
- New fields default to None/false
- Backward compatible

---

## Testing Plan

### Unit Tests
- Domain model validation
- Repository operations
- Command handler logic

### Integration Tests
- End-to-end split payment flow
- Template creation and usage
- History pagination

### Manual Testing Checklist
- [ ] Create split payment request
- [ ] Multiple users contribute to split
- [ ] Split payment completion notification
- [ ] Create template
- [ ] Use template to generate invoice
- [ ] View request history with filters
- [ ] Pagination works correctly
- [ ] Cancel pending request
- [ ] View invoice details

---

## Future Enhancements (Phase 4+)

- Recurring split payments (e.g., monthly group expenses)
- Template sharing between users
- Export history to CSV
- Analytics dashboard (spending patterns, top payers)
- Automated reminders for pending requests
- Multi-currency template support

---

## References

- [Phase 1: Direct Payment Buttons](../README.md) - Completed
- [Invoice Domain Model](../crates/pulse-domain/src/models/invoice.rs)
- [Invoice Repository](../crates/pulse-application/src/ports/invoice_repository.rs)
