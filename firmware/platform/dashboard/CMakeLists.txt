set(component_sources
    "fonts/src/dashboard_fonts.cpp"
    "fonts/src/font_glyph_allocator.cpp"
    "layout/src/dashboard_layout.cpp"
    "utilities/boot_splash/src/boot_splash.cpp"
    "utilities/display_diagnostics/src/display_diagnostics.cpp"
    "utilities/render_trigger/src/render_trigger.cpp"
    "widgets/delta_time/src/delta_time_widget.cpp"
    "widgets/text/src/text_widget.cpp"
    "widgets/text/src/widget_binding.cpp"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp"
    "src/widget_descriptor.cpp")
set(component_include_dirs
    "include"
    "fonts/include"
    "layout/include"
    "utilities/boot_splash/include"
    "utilities/display_diagnostics/include"
    "utilities/render_trigger/include"
    "widgets/delta_time/include"
    "widgets/text/include"
    "widgets/performance_overlay/include")

if(CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040 OR
   CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C)
    set(boot_splash_asset "assets/boot_splash/logo_480x480.rgb565")
else()
    set(boot_splash_asset "assets/boot_splash/logo_320x170.rgb565")
endif()

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    EMBED_FILES ${boot_splash_asset}
    REQUIRES configuration_contract delta_time font_assets lvgl__lvgl telemetry
    PRIV_REQUIRES display esp_lvgl_port esp_timer heap logger performance
                  simcore_config time_transform transport)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
