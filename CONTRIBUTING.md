---
title: Contributing to drprepperusa-kayla-parallel
last_updated: 2026-03-26
status: active
---

# Contributing to drprepperusa-kayla-parallel

## Documentation Requirements

**All PRs must include comprehensive documentation.** No exceptions.

### What to Document

1. **Code Comments**
   - JSDoc for all public functions
   - Inline comments for complex logic
   - Type annotations (no `any`)
   - Edge case handling

2. **README Updates**
   - Feature description
   - Usage examples
   - Configuration options
   - Known limitations

3. **Architecture Documentation**
   - Data structure diagrams (if applicable)
   - Component interaction flows
   - API contracts (request/response)
   - Error handling strategy

4. **PR Description**
   - What was changed and why
   - Which features were added/fixed
   - Links to related issues
   - Testing approach
   - Breaking changes (if any)

5. **Changelog Entry**
   - Add entry to CHANGELOG.md
   - Format: `- [FEATURE|FIX|DOCS] description (PR #X)`

---

## Code Standards

### TypeScript
- Strict mode enabled (`--strict`)
- No implicit `any`
- Exhaustive type checking
- JSDoc for public APIs

### React Components
- Functional components + hooks only
- Custom hooks for reusable logic
- Proper prop typing
- Accessibility attributes (aria-*, role, etc.)

### Store (Zustand)
- Pure state mutations (no side effects)
- Immutable data structures
- Validation on write
- Clear action naming

### Testing
- Unit tests for logic (filters, validation, selectors)
- Integration tests for features
- Edge case coverage (null, empty, extreme values)
- >80% code coverage

---

## PR Checklist

Before submitting, ensure:

- [ ] Code follows TypeScript strict mode
- [ ] JSDoc comments added to public functions
- [ ] Inline comments explain complex logic
- [ ] README.md or relevant docs updated
- [ ] CHANGELOG.md entry added
- [ ] No console.log() left in code
- [ ] Imports organized (Zustand, React, utils, styles)
- [ ] No unused imports
- [ ] Tests written + passing (>80% coverage)
- [ ] ESLint checks pass (`npm run lint`)
- [ ] TypeScript checks pass (`npm run type-check`)

---

## Commit Message Format

```
[type]: [description]

[optional body]

[optional footer: Fixes #123, Related to #456]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code restructuring (no behavior change)
- `test`: Test additions/changes
- `chore`: Build, deps, config

**Example**:
```
feat: Add SKU sort grouping to orders table

- Group orders by SKU + quantity combination
- Add collapsible group headers
- Enable batch selection per group
- Add tests for grouping logic

Fixes #42
```

---

## Documentation Structure

### For Features

Create a file: `docs/features/[feature-name].md`

```markdown
# Feature: [Name]

## Overview
Brief description of what this feature does.

## Motivation
Why was this feature built? What problem does it solve?

## Usage
Code examples showing how to use the feature.

## API
- Functions
- Props
- Configuration options
- Return values

## Edge Cases
Known limitations, edge cases, workarounds.

## Testing
How to test this feature manually.
```

### For Components

Add JSDoc + inline comments:

```typescript
/**
 * OrdersTable — Display orders in a sortable, filterable table.
 *
 * @component
 * @example
 * const orders = useOrdersStore(state => state.getPaginatedOrders());
 * return <OrdersTable orders={orders} onRowClick={selectRow} />
 *
 * @param {Order[]} orders - Orders to display
 * @param {(id: string) => void} onRowClick - Callback when row clicked
 * @param {Set<string>} selectedIds - Set of selected order IDs
 * @returns {ReactElement} Rendered table
 */
export function OrdersTable({
  orders,
  onRowClick,
  selectedIds
}: OrdersTableProps): ReactElement {
  // Component code...
}
```

### For Store Actions

```typescript
/**
 * Update an order with partial data. Only updates the allOrders source array.
 * Never mutate individual order objects; create new objects via spread.
 *
 * @param id - Order ID to update
 * @param updates - Partial order fields to update (never updates 'id')
 *
 * @example
 * store.updateOrder('order-123', { status: 'shipped', label: newLabel })
 *
 * @throws When order doesn't exist (silent, no-op)
 */
updateOrder: (id: string, updates: Partial<Omit<Order, 'id'>>) => void;
```

---

## Testing Requirements

### Unit Tests (Logic)
- Test filters: search, SKU, date ranges
- Test validation: orders, labels, billing calculations
- Test selectors: filtered, paginated, panel state
- Test store actions: mutations, state transitions

### Integration Tests (Features)
- Filter + paginate together
- Selection mode transitions (checkbox ↔ row-click)
- Export CSV with filters applied
- Zoom + table rendering

### Visual/E2E Tests (Manual or Automated)
- Table layout on different screen sizes
- Scroll behavior (horizontal, vertical)
- Responsive breakpoints
- Zoom levels don't break layout

---

## File Organization

```
src/
├── components/          # React components
│   ├── OrdersTable.tsx
│   ├── ControlBar.tsx
│   └── Shipment/        # Feature sub-folder
│       ├── ShippingPanel.tsx
│       └── BatchPanel.tsx
├── pages/               # Page components
│   └── AwaitingShipments.tsx
├── stores/              # Zustand stores (SSOT per domain)
│   └── ordersStore.ts
├── types/               # TypeScript interfaces
│   └── orders.ts
├── utils/               # Pure functions (no side effects)
│   ├── orderFilters.ts
│   ├── orderValidation.ts
│   ├── orderConstants.ts
│   └── exportCsv.ts
├── styles/              # SCSS modules
│   └── AwaitingShipments.module.scss
├── data/                # Mock data, test fixtures
│   └── mockOrders.ts
└── __tests__/           # Test files
    ├── ordersStore.test.ts
    ├── orderFilters.test.ts
    └── AwaitingShipments.test.tsx

docs/
├── features/            # Feature documentation
│   ├── filtering.md
│   ├── selection.md
│   └── export.md
├── api/                 # API contracts
│   └── shipstation.md
└── architecture/        # System design
    ├── store-design.md
    └── component-hierarchy.md
```

---

## Review Process

1. **Author** submits PR with docs + code + tests
2. **Reviewer** checks:
   - Code quality (TS, logic, performance)
   - Documentation completeness
   - Test coverage (>80%)
   - Compliance with spec
3. **Approval** requires:
   - ✅ Code review (Albert)
   - ✅ Business logic review (DJ)
   - ✅ Tests passing (100%)
   - ✅ Docs complete

---

## Common Mistakes to Avoid

❌ **Don't**:
- Leave console.log() in production code
- Use `any` type
- Skip JSDoc for public functions
- Commit without tests
- Change data structure without updating docs
- Merge PRs without documentation

✅ **Do**:
- Write tests first (TDD)
- Document as you code
- Update CHANGELOG.md
- Add architecture diagrams when needed
- Request review early (don't wait for "perfect")
- Communicate breaking changes upfront

---

## Questions?

See:
- **Architecture**: `DATA-STRUCTURES-AND-ZUSTAND-SCHEMA.md`
- **Implementation Plan**: `PHASE-1-IMPLEMENTATION-PLAN.md`
- **Specifications**: `DJ-SPECIFICATION-QA-LOCKED.md`
- **Pending Items**: `DJ-PENDING-QUESTIONS.md`

---

**Last Updated**: 2026-03-26
**Maintained By**: Kayla (team)
