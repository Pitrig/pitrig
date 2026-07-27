set(component_sources
    "fonts/src/dashboard_fonts.cpp"
    "fonts/simcore_lcd_39.c"
    "fonts/simcore_lcd_43.c"
    "fonts/simcore_lcd_47.c"
    "fonts/simcore_lcd_53.c"
    "fonts/simcore_roboto_mono_43.c"
    "layout/src/dashboard_layout.cpp"
    "utilities/display_diagnostics/src/display_diagnostics.cpp"
    "widgets/delta_time/src/delta_time_widget.cpp"
    "widgets/estimated_lap_time/src/estimated_lap_time_widget.cpp"
    "widgets/lap_timer/src/lap_timer_widget.cpp"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp")
set(component_include_dirs
    "include"
    "fonts/include"
    "layout/include"
    "utilities/display_diagnostics/include"
    "widgets/delta_time/include"
    "widgets/estimated_lap_time/include"
    "widgets/lap_timer/include"
    "widgets/performance_overlay/include")

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    REQUIRES lvgl__lvgl
    PRIV_REQUIRES delta_time esp_lvgl_port estimated_lap_time heap lap_timer
                  performance simcore_config transport)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
