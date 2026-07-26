set(component_sources
    "fonts/src/dashboard_fonts.cpp"
    "fonts/simcore_lcd_58.c"
    "fonts/simcore_lcd_64.c"
    "fonts/simcore_lcd_70.c"
    "fonts/simcore_lcd_80.c"
    "fonts/simcore_roboto_mono_58.c"
    "layout/src/dashboard_layout.cpp"
    "widgets/delta_time/src/delta_time_widget.cpp"
    "widgets/lap_timer/src/lap_timer_widget.cpp"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp")
set(component_include_dirs
    "include"
    "fonts/include"
    "layout/include"
    "widgets/delta_time/include"
    "widgets/lap_timer/include"
    "widgets/performance_overlay/include")

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    PRIV_REQUIRES delta_time esp_lvgl_port lap_timer performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
