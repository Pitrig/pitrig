# ADR 0015: Widget Type Descriptors

Status: Accepted; supersedes the fixed widget-type list in ADR 0007

## Context

The dashboard composition named every widget type. Its state structure had a
member per type, creation branched per type, the "is the dashboard empty" test
enumerated types, and the compositing pass sized its array as
`kMaximumTextWidgets + 1` and reached into typed storage to read each widget's
ordering key. Adding a widget type meant editing all of it.

ADR 0011 forbids the usual remedy: "Do not introduce a runtime Service Registry
or global service lookup", and ADR 0012 adds that "the dashboard does not become
a service locator". The sanctioned shape already exists in the repository —
`core/module_manager` holds compile-time descriptors with an enabled flag,
function pointers, and an explicit context, and performs no allocation, RTTI, or
name-based lookup.

## Decision

Describe each widget type with a compile-time `WidgetDescriptor`: its
`WidgetType`, an enabled flag, create and destroy function pointers, an accessor
for the root LVGL object of one instance, and an explicit context pointer. A
bounded `WidgetManager` owns their lifecycle, creating enabled types and
destroying created ones in reverse registration order. It allocates nothing,
uses no RTTI, and performs no name-based lookup.

Widget storage and dependencies stay in the dashboard composition. Each widget
type gets a context structure holding its instances plus the inputs its creation
needs; that structure is the `context` its descriptor carries. Configuration
presence sets the enabled flag, exactly as module descriptors work.

Keep compositing free of widget-type knowledge by carrying the ordering keys in
the screen's `WidgetReference` table: `z_index` ascending, authored array order
breaking ties. The compositing pass asks the manager for a root object by type
and index and sorts; it never inspects a widget's configuration.

This is not a runtime registry. The descriptor table is assembled by the
composition at startup from a fixed set known at compile time.

A widget type earns its place by being a shape the primitives cannot express,
not by being a feature. Delta Time was the counter-example: a reading, three
threshold colours, and a scale filled from the centre. Once a text widget could
compose a signed duration, a rule could colour it, and a bar could fill from a
configured origin, the type was a preset with parser, validation, composition,
and configurator code behind it. It was removed in schema 5 and is authored from
those primitives instead. Apply the same test before adding one: name the pixels
it draws that no existing type can.

## Consequences

- Adding a widget type is a schema entry, a widget implementation, and one
  descriptor; the manager, the compositing pass, and the layout are untouched.
- Removing one is the same list in reverse, plus a migration: a document that
  named the type has to be rewritten into the primitives that replace it.
- A widget type that fails to create no longer leaves the dashboard half-built:
  already-created types are destroyed in reverse order.
- The ordering rule from ADR 0007 is preserved and now stated in data rather
  than in a branch.
- The manager cannot express per-instance lifecycle, only per-type. A widget
  type that needs to create and destroy individual instances at runtime will
  need an extension recorded by another decision.
