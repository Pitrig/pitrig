from __future__ import annotations

from typing import Any

from .errors import fail


def root_struct(document: dict[str, Any]) -> str:
    return next(name for name, body in document["structs"].items() if body.get("root"))


def document_ids(document: dict[str, Any]) -> list[str]:
    return list(document["documents"])


def document_type(name: str) -> str:
    return f"{name[:1].upper()}{name[1:]}Document"


def document_fields(document: dict[str, Any], name: str) -> list[dict[str, Any]]:
    sections = set(document["documents"][name]["sections"])
    return [
        field
        for field in serialized_fields(document["structs"][root_struct(document)])
        if field.get("flatten") or field["name"] in sections
    ]


def document_keys(document: dict[str, Any], name: str) -> list[str]:
    keys: list[str] = []
    for field in document_fields(document, name):
        if field.get("flatten"):
            keys.extend(object_keys(document, field["struct"]))
        else:
            keys.append(json_key(field))
    return keys


def struct_order(document: dict[str, Any]) -> list[str]:
    structs = document["structs"]
    ordered: list[str] = []
    visiting: set[str] = set()

    def visit(name: str) -> None:
        if name in ordered:
            return
        if name in visiting:
            fail(f"cyclic struct reference involving '{name}'")
        visiting.add(name)
        for field in structs[name].get("fields", []):
            if field["kind"] in ("struct", "array"):
                visit(field["struct"])
        visiting.discard(name)
        ordered.append(name)

    for name in structs:
        visit(name)
    return ordered


def bound(
    field: dict[str, Any], edge: str, document: dict[str, Any]
) -> tuple[str, int] | None:
    raw = field.get(edge)
    if raw is None:
        return None
    if isinstance(raw, str):
        return raw, document["limits"][raw]["value"]
    return str(raw), int(raw)


def bounded_fields(
    document: dict[str, Any],
    struct_name: str,
    expand_flatten: bool,
    path: str = "",
    accessor: str = "",
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for field in serialized_fields(document["structs"][struct_name]):
        name = json_key(field)
        member = field["name"]
        if field["kind"] == "struct":
            if field.get("flatten") and not expand_flatten:
                continue
            child_path = path if field.get("flatten") else f"{path}{name}."
            entries.extend(
                bounded_fields(
                    document,
                    field["struct"],
                    expand_flatten,
                    child_path,
                    f"{accessor}{member}.",
                )
            )
            continue
        minimum = bound(field, "minimum", document)
        maximum = bound(field, "maximum", document)
        if minimum is None and maximum is None:
            continue
        entries.append(
            {
                "path": f"{path}{name}",
                "accessor": f"{accessor}{member}",
                "kind": field["kind"],
                "minimum": minimum,
                "maximum": maximum,
                "zero_means_off": bool(field.get("zero_means_off")),
            }
        )
    return entries


def range_roots(document: dict[str, Any]) -> list[str]:
    roots = [
        name for name, body in document["structs"].items() if body.get("widget_type")
    ]
    for body in document["structs"].values():
        for field in body.get("fields", []):
            if field["kind"] != "array":
                continue
            element = field["struct"]
            if element in roots or not bounded_fields(document, element, True):
                continue
            roots.append(element)
    return roots


def serialized_fields(body: dict[str, Any]) -> list[dict[str, Any]]:
    return [field for field in body.get("fields", []) if field.get("serialized", True)]


def json_key(field: dict[str, Any]) -> str:
    return field.get("json", field["name"])


def object_keys(document: dict[str, Any], struct_name: str) -> list[str]:
    body = document["structs"][struct_name]
    if body.get("serialized") is False:
        return []
    externals = document.get("external_types", {})
    keys: list[str] = ["type"] if body.get("widget_type") else []
    for field in serialized_fields(body):
        if field.get("flatten"):
            keys.extend(object_keys(document, field["struct"]))
        elif field["kind"] == "external" and field.get("inline"):
            keys.extend(externals[field["external"]]["keys"])
        else:
            keys.append(json_key(field))
    return keys


def text_fields(
    document: dict[str, Any], body: dict[str, Any]
) -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    for field in serialized_fields(body):
        if field.get("flatten"):
            found.extend(text_fields(document, document["structs"][field["struct"]]))
        elif field["kind"] == "text":
            found.append((field["name"], field))
    return found


def child_types(document: dict[str, Any], body: dict[str, Any]) -> dict[str, str]:
    children: dict[str, str] = {}
    for field in serialized_fields(body):
        if field.get("flatten"):
            children.update(child_types(document, document["structs"][field["struct"]]))
        elif field["kind"] == "struct":
            children[json_key(field)] = field["struct"]
        elif field["kind"] == "array" and not field.get("json_variants"):
            children[json_key(field)] = field["struct"]
        elif field["kind"] == "external" and not field.get("inline"):
            children[json_key(field)] = field["external"]
    return children


def widget_variants(document: dict[str, Any]) -> dict[str, str]:
    return {
        body["widget_type"]: name
        for name, body in document["structs"].items()
        if body.get("widget_type")
    }


def widget_pools(document: dict[str, Any]) -> list[tuple[str, str, dict[str, Any]]]:
    variants = widget_variants(document)
    declared = set(document["enums"]["WidgetType"]["json_values"])
    if set(variants) != declared:
        fail(
            "WidgetType values and widget_type structs disagree: "
            f"{sorted(declared ^ set(variants))}"
        )
    arrays = {
        field["struct"]: field
        for field in document["structs"]["DashboardConfiguration"]["fields"]
        if field["kind"] == "array"
    }
    pools: list[tuple[str, str, dict[str, Any]]] = []
    for value in document["enums"]["WidgetType"]["json_values"]:
        struct = variants[value]
        if struct not in arrays:
            fail(f"{struct} has no storage array in DashboardConfiguration")
        pools.append((value, struct, arrays[struct]))
    return pools


def snake(name: str) -> str:
    result: list[str] = []
    for index, character in enumerate(name):
        if character.isupper() and index > 0:
            result.append("_")
        result.append(character.lower())
    return "".join(result)


def screaming(name: str) -> str:
    trimmed = name[1:] if name.startswith("k") and name[1:2].isupper() else name
    return snake(trimmed).upper()
