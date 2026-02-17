# Tailwind CSS Quick Reference - StatCo Comply

## 🎨 Common Patterns

### Page Layout
```html
<div class="page">
  <div class="page-header">
    <div class="title">
      <h2 class="text-2xl font-semibold text-gray-900">Page Title</h2>
      <div class="subtitle">Description text</div>
    </div>
    <div class="nav-actions">
      <button class="btn-primary">Action</button>
    </div>
  </div>
  <!-- Content -->
</div>
```

### Loading Spinner
```html
<div class="flex items-center justify-center py-12">
  <div class="flex items-center gap-3 text-gray-600">
    <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Loading...</span>
  </div>
</div>
```

### KPI Grid (4 columns)
```html
<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
  <div class="stat-card">
    <div class="stat-label">Label</div>
    <div class="stat-value">123</div>
    <div class="text-xs text-gray-500 mt-2">Subtitle</div>
  </div>
</div>
```

### KPI Card with Color
```html
<div class="stat-card bg-gradient-to-br from-red-50 to-red-100 border-red-200">
  <div class="stat-label text-red-600">Overdue</div>
  <div class="stat-value text-red-900">{{ count }}</div>
</div>
```

### Card with Header
```html
<div class="card">
  <div class="card-header">
    <h3 class="card-title">Section Title</h3>
    <button class="btn-sm btn-outline">Action</button>
  </div>
  <!-- Card content -->
</div>
```

### Modern Table
```html
<div class="overflow-x-auto">
  <table class="w-full">
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
      </tr>
    </thead>
    <tbody>
      <tr class="hover:bg-gray-50 transition-colors cursor-pointer">
        <td>{{ data }}</td>
        <td><span class="badge badge-success">Status</span></td>
      </tr>
    </tbody>
  </table>
</div>
```

### Form Layout
```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div class="form-group">
    <label for="field">Field Label</label>
    <input 
      id="field" 
      type="text" 
      [(ngModel)]="value"
      class="w-full"
      placeholder="Enter value"
    />
  </div>
</div>
```

### Button with Icon
```html
<button class="btn-primary">
  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
  </svg>
  Add Item
</button>
```

### Empty State
```html
<div *ngIf="items.length === 0" class="text-center py-8">
  <div class="text-4xl mb-2">🎉</div>
  <div class="text-sm text-gray-600">No items found</div>
</div>
```

## 🎯 Button Classes

```html
<!-- Primary (Blue) -->
<button class="btn-primary">Primary Action</button>

<!-- Secondary (Gray) -->
<button class="btn-secondary">Cancel</button>

<!-- Danger (Red) -->
<button class="btn-danger">Delete</button>

<!-- Outline -->
<button class="btn-outline">View Details</button>

<!-- Sizes -->
<button class="btn-primary btn-sm">Small</button>
<button class="btn-primary btn-lg">Large</button>

<!-- With Icon -->
<button class="btn-primary">
  <svg class="w-4 h-4 mr-2">...</svg>
  Text
</button>
```

## 🏷️ Badge Classes

```html
<span class="badge badge-primary">Primary</span>
<span class="badge badge-success">Approved</span>
<span class="badge badge-warning">Pending</span>
<span class="badge badge-danger">Overdue</span>
<span class="badge badge-gray">Inactive</span>
```

## 📊 Grid Layouts

```html
<!-- 2 columns mobile, 4 desktop -->
<div class="grid grid-cols-2 md:grid-cols-4 gap-4">

<!-- 1 column mobile, 2 desktop -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

<!-- 1 column mobile, 3 desktop -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-4">

<!-- Complex: 3-2 split on desktop -->
<div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
  <div class="lg:col-span-3">60% width</div>
  <div class="lg:col-span-2">40% width</div>
</div>

<!-- Auto-fit responsive -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
```

## 🎨 Common Color Utilities

### Text Colors
```html
<!-- Brand -->
<span class="text-statco-blue">Brand Blue</span>

<!-- Status Colors -->
<span class="text-gray-600">Muted</span>
<span class="text-gray-900">Dark</span>
<span class="text-green-600">Success</span>
<span class="text-yellow-600">Warning</span>
<span class="text-red-600">Danger</span>
<span class="text-blue-600">Info</span>
```

### Background Colors
```html
<!-- Gradients (for stat cards) -->
<div class="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
<div class="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
<div class="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200">
<div class="bg-gradient-to-br from-red-50 to-red-100 border-red-200">
```

## 📏 Spacing Scale

```html
<!-- Padding -->
p-2    0.5rem   8px
p-3    0.75rem  12px
p-4    1rem     16px
p-6    1.5rem   24px
p-8    2rem     32px

<!-- Margin -->
m-2    0.5rem   8px
mb-4   1rem     16px  (margin-bottom)
mt-6   1.5rem   24px  (margin-top)

<!-- Gap (for flex/grid) -->
gap-2  0.5rem   8px
gap-3  0.75rem  12px
gap-4  1rem     16px
gap-6  1.5rem   24px
```

## 🔤 Typography Scale

```html
<!-- Sizes -->
text-xs    0.75rem  12px
text-sm    0.875rem 14px
text-base  1rem     16px
text-lg    1.125rem 18px
text-xl    1.25rem  20px
text-2xl   1.5rem   24px
text-3xl   1.875rem 30px

<!-- Weights -->
font-normal   400
font-medium   500
font-semibold 600
font-bold     700

<!-- Page Title -->
<h1 class="text-3xl font-bold text-gray-900">

<!-- Section Title -->
<h2 class="text-2xl font-semibold text-gray-900">

<!-- Card Title -->
<h3 class="text-lg font-semibold text-gray-900">
```

## 🎭 Hover & Transition Effects

```html
<!-- Hover Background -->
<div class="hover:bg-gray-50 transition-colors">

<!-- Hover Shadow -->
<div class="hover:shadow-md transition-shadow duration-200">

<!-- Hover Scale -->
<div class="hover:scale-105 transition-transform">

<!-- Group Hover (parent affects child) -->
<div class="group">
  <span class="text-gray-700 group-hover:text-statco-blue transition-colors">
</div>

<!-- All transitions at once -->
<div class="transition-all duration-200">
```

## 🔘 Interactive States

```html
<!-- Clickable -->
<div class="cursor-pointer hover:bg-gray-50 transition-colors">

<!-- Disabled -->
<button disabled class="disabled:opacity-50 disabled:cursor-not-allowed">

<!-- Focus Ring (for forms) -->
<input class="focus:ring-2 focus:ring-statco-blue focus:border-transparent">
```

## 📱 Responsive Utilities

```html
<!-- Hide on mobile, show on desktop -->
<div class="hidden lg:block">

<!-- Show on mobile, hide on desktop -->
<div class="block lg:hidden">

<!-- Different padding at breakpoints -->
<div class="p-4 lg:p-6">

<!-- Stack on mobile, row on desktop -->
<div class="flex flex-col lg:flex-row">
```

## 🎪 Common SVG Icons

### Refresh Icon
```html
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
</svg>
```

### Plus Icon
```html
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
    d="M12 4v16m8-8H4" />
</svg>
```

### Check Icon
```html
<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
    d="M5 13l4 4L19 7" />
</svg>
```

## 🚨 Common Mistakes to Avoid

❌ **Don't:** Mix old and new styles
```html
<div class="card" style="padding: 20px">
```

✅ **Do:** Use Tailwind consistently
```html
<div class="card p-5">
```

---

❌ **Don't:** Use arbitrary values excessively
```html
<div class="p-[23px] m-[17px]">
```

✅ **Do:** Use Tailwind's spacing scale
```html
<div class="p-6 m-4">
```

---

❌ **Don't:** Forget responsive design
```html
<div class="grid grid-cols-4">
```

✅ **Do:** Make it mobile-first
```html
<div class="grid grid-cols-2 lg:grid-cols-4">
```

---

❌ **Don't:** Skip transition classes
```html
<div class="hover:bg-gray-50">
```

✅ **Do:** Add smooth transitions
```html
<div class="hover:bg-gray-50 transition-colors duration-200">
```

## 📋 Quick Migration Checklist

- [ ] Replace page layout divs with `page` and `page-header`
- [ ] Update buttons to use `btn-*` classes
- [ ] Convert tables to use Tailwind utilities
- [ ] Add hover states to interactive elements
- [ ] Implement responsive grid layouts
- [ ] Update loading states with spinner
- [ ] Add empty state messages with emoji
- [ ] Replace custom badges with `badge` classes
- [ ] Update alerts to use `alert` classes
- [ ] Add transition effects for smooth UX
- [ ] Test on mobile and desktop
- [ ] Remove old CSS from component .scss files

---

**Quick Tip:** When in doubt, check [styles.scss](../src/styles.scss) for component classes or the [UI Modernization Guide](./UI_MODERNIZATION_GUIDE.md) for detailed patterns!
