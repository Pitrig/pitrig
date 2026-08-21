set(component_sources
    "conditions/src/widget_conditions.cpp"
    "frame/src/widget_collection.cpp"
    "frame/src/frame_painter.cpp"
    "frame/src/widget_frame.cpp"
    "fonts/src/dashboard_fonts.cpp"
    "images/src/dashboard_images.cpp"
    "fonts/src/font_glyph_allocator.cpp"
    "layout/src/dashboard_layout.cpp"
    "value_text/src/value_text.cpp"
    "navigation/src/screen_navigation.cpp"
    "slots/src/widget_slots.cpp"
    "utilities/boot_splash/src/boot_splash.cpp"
    "utilities/render_trigger/src/render_trigger.cpp"
    "widgets/arc/src/arc_widget.cpp"
    "widgets/bar/src/bar_widget.cpp"
    "widgets/graph/src/graph_widget.cpp"
    "widgets/image/src/image_widget.cpp"
    "widgets/indicator/src/indicator_widget.cpp"
    "widgets/shape/src/shape_widget.cpp"
    "widgets/slot/src/slot_widget.cpp"
    "widgets/text/src/text_widget.cpp"
    "widgets/text/src/widget_binding.cpp"
    "widgets/performance_overlay/src/performance_overlay_widget.cpp"
    "src/widget_descriptor.cpp")
set(component_include_dirs
    "include"
    "conditions/include"
    "frame/include"
    "fonts/include"
    "images/include"
    "layout/include"
    "navigation/include"
    "slots/include"
    "value_text/include"
    "utilities/boot_splash/include"
    "utilities/render_trigger/include"
    "widgets/arc/include"
    "widgets/bar/include"
    "widgets/graph/include"
    "widgets/image/include"
    "widgets/indicator/include"
    "widgets/shape/include"
    "widgets/slot/include"
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
    REQUIRES configuration_contract font_assets image_assets lvgl__lvgl
             telemetry
    PRIV_REQUIRES display esp_lvgl_port esp_rom esp_timer heap logger
                  number_transform performance simcore_config text_writer
                  time_transform transport)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
