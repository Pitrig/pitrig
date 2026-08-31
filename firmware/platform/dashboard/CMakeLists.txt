set(component_sources
    "conditions/src/widget_conditions.cpp"
    "frame/src/widget_collection.cpp"
    "frame/src/frame_geometry.cpp"
    "frame/src/frame_painter.cpp"
    "frame/src/widget_frame.cpp"
    "fonts/src/dashboard_fonts.cpp"
    "images/src/dashboard_images.cpp"
    "fonts/src/font_glyph_allocator.cpp"
    "layout/src/dashboard_layout.cpp"
    "value_text/src/value_text.cpp"
    "memory/src/lvgl_heap.cpp"
    "navigation/src/screen_navigation.cpp"
    "slots/src/widget_slots.cpp"
    "utilities/boot_splash/src/splash_glow.cpp"
    "utilities/boot_splash/src/boot_splash.cpp"
    "utilities/render_trigger/src/render_trigger.cpp"
    "widgets/arc/src/arc_widget.cpp"
    "widgets/bar/src/bar_widget.cpp"
    "widgets/graph/src/graph_binding.cpp"
    "widgets/graph/src/graph_plot.cpp"
    "widgets/graph/src/graph_sampling.cpp"
    "widgets/graph/src/graph_widget.cpp"
    "widgets/image/src/image_widget.cpp"
    "widgets/indicator/src/indicator_geometry.cpp"
    "widgets/indicator/src/indicator_widget.cpp"
    "widgets/shape/src/shape_widget.cpp"
    "widgets/slot/src/slot_widget.cpp"
    "widgets/text/src/text_drawing.cpp"
    "widgets/text/src/text_widget.cpp"
    "widgets/text/src/widget_binding.cpp"
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
    "widgets/text/include")

if(CONFIG_SIMCORE_FACTORY_BOARD_GUITION_ESP32_4848S040 OR
   CONFIG_SIMCORE_FACTORY_BOARD_GUITION_JC1060P470C)
    set(boot_splash_asset "assets/boot_splash/logo_480x480.rgb565")
else()
    set(boot_splash_asset "assets/boot_splash/logo_320x170.rgb565")
endif()

set(lvgl_ldfragments "")
if(CONFIG_IDF_TARGET_ESP32S3)
    set(lvgl_ldfragments "lvgl_hot.lf")
endif()

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    EMBED_FILES ${boot_splash_asset}
    LDFRAGMENTS ${lvgl_ldfragments}
    REQUIRES configuration_contract font_assets image_assets lvgl__lvgl
             telemetry
    PRIV_REQUIRES display esp_lvgl_port esp_rom esp_system esp_timer heap logger
                  number_transform performance simcore_config text_writer
                  time_transform transport)

foreach(symbol lv_mem_init lv_mem_deinit lv_mem_add_pool lv_mem_remove_pool
               lv_malloc_core lv_realloc_core lv_free_core lv_mem_monitor_core
               lv_mem_test_core)
    set_property(TARGET ${COMPONENT_LIB} APPEND PROPERTY
                 INTERFACE_LINK_LIBRARIES "-u ${symbol}")
endforeach()

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
