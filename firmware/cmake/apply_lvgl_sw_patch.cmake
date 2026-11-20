include("${CMAKE_CURRENT_LIST_DIR}/apply_patch_stack.cmake")

set(_pitrig_lvgl_sw_dir "${CMAKE_CURRENT_LIST_DIR}/../managed_components/lvgl__lvgl")
set(_pitrig_lvgl_sw_version_header "${_pitrig_lvgl_sw_dir}/lv_version.h")
set(_pitrig_lvgl_sw_patches
    "${CMAKE_CURRENT_LIST_DIR}/../patches/lvgl-9.5.0-sw-round-shapes.patch")

if(NOT EXISTS "${_pitrig_lvgl_sw_version_header}")
    message(FATAL_ERROR
        "LVGL managed component was not resolved before applying the software renderer patches")
endif()

file(READ "${_pitrig_lvgl_sw_version_header}" _pitrig_lvgl_sw_version)
foreach(_pitrig_lvgl_sw_part IN ITEMS
        "LVGL_VERSION_MAJOR 9"
        "LVGL_VERSION_MINOR 5"
        "LVGL_VERSION_PATCH 0")
    string(FIND "${_pitrig_lvgl_sw_version}" "${_pitrig_lvgl_sw_part}" _pitrig_lvgl_sw_match)
    if(_pitrig_lvgl_sw_match EQUAL -1)
        message(FATAL_ERROR
            "The software renderer patches support only LVGL 9.5.0. "
            "Review or remove them under firmware/patches before building this LVGL version.")
    endif()
endforeach()

pitrig_apply_patch_stack("LVGL 9.5.0 software renderer" "${_pitrig_lvgl_sw_dir}" ${_pitrig_lvgl_sw_patches})

if(CONFIG_COMPILER_OPTIMIZATION_SIZE)
    idf_component_get_property(_pitrig_lvgl_sw_lib lvgl__lvgl COMPONENT_LIB)
    set(_pitrig_lvgl_sw_hot_sources)
    foreach(_pitrig_lvgl_sw_source IN ITEMS
            lv_draw_sw.c
            lv_draw_sw_arc.c
            lv_draw_sw_border.c
            lv_draw_sw_fill.c
            lv_draw_sw_img.c
            lv_draw_sw_letter.c
            lv_draw_sw_line.c
            lv_draw_sw_mask.c
            blend/lv_draw_sw_blend.c
            blend/lv_draw_sw_blend_to_rgb565.c)
        list(APPEND _pitrig_lvgl_sw_hot_sources "${_pitrig_lvgl_sw_dir}/src/draw/sw/${_pitrig_lvgl_sw_source}")
    endforeach()
    set_source_files_properties(${_pitrig_lvgl_sw_hot_sources}
        TARGET_DIRECTORY ${_pitrig_lvgl_sw_lib}
        PROPERTIES COMPILE_OPTIONS "-O2")
endif()

unset(_pitrig_lvgl_sw_dir)
unset(_pitrig_lvgl_sw_version_header)
unset(_pitrig_lvgl_sw_patches)
unset(_pitrig_lvgl_sw_version)
unset(_pitrig_lvgl_sw_part)
unset(_pitrig_lvgl_sw_match)
unset(_pitrig_lvgl_sw_lib)
unset(_pitrig_lvgl_sw_hot_sources)
unset(_pitrig_lvgl_sw_source)
