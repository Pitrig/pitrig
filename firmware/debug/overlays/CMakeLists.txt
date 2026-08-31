set(debug_sources "")
set(debug_includes "")
if(CONFIG_SIMCORE_DEBUG)
    set(debug_sources "fps_overlay/src/fps_overlay_widget.cpp"
                      "performance_overlay/src/performance_overlay_widget.cpp")
    set(debug_includes "fps_overlay/include" "performance_overlay/include")
endif()

idf_component_register(SRCS ${debug_sources}
                       INCLUDE_DIRS ${debug_includes}
                       REQUIRES dashboard transport
                       PRIV_REQUIRES esp_lvgl_port lvgl__lvgl performance)

if(debug_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
