set(debug_sources "")
set(debug_includes "")
if(CONFIG_PITRIG_DEBUG)
    set(debug_sources "fps_overlay/src/fps_overlay_widget.cpp"
                      "performance_overlay/src/performance_overlay_widget.cpp"
                      "src/dashboard_overlays.cpp")
    set(debug_includes "include" "fps_overlay/include"
                       "performance_overlay/include")
endif()

idf_component_register(SRCS ${debug_sources}
                       INCLUDE_DIRS ${debug_includes}
                       REQUIRES dashboard transport
                       PRIV_REQUIRES esp_lvgl_port logger lvgl__lvgl
                                     performance pitrig_config)

if(debug_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
