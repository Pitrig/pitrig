set(component_sources
    "fonts/src/dashboard_fonts.cpp"
    "layout/src/dashboard_layout.cpp"
    "utilities/boot_splash/src/boot_splash.cpp"
    "utilities/display_diagnostics/src/display_diagnostics.cpp"
    "widgets/delta_time/src/delta_time_widget.cpp"
    "widgets/lap_timer/src/lap_timer_widget.cpp"
    "widgets/text/src/text_widget.cpp"
    "widgets/text/src/widget_binding.cpp"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp")
set(component_include_dirs
    "include"
    "fonts/include"
    "layout/include"
    "utilities/boot_splash/include"
    "utilities/display_diagnostics/include"
    "widgets/delta_time/include"
    "widgets/lap_timer/include"
    "widgets/text/include"
    "widgets/performance_overlay/include")

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    EMBED_FILES
        "assets/boot_splash/logo_320x170.rgb565"
        "assets/boot_splash/logo_480x480.rgb565"
    REQUIRES font_assets lvgl__lvgl telemetry
    PRIV_REQUIRES delta_time display esp_lvgl_port heap lap_timer performance
                  simcore_config transport)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
