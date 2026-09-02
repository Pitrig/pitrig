idf_component_register(SRCS "src/rgb_leds.cpp" "src/rgb_frames.cpp"
                            "src/led_device.cpp"
                            "src/led_matrix_paint.cpp" "src/led_paint.cpp"
                            "src/led_surface.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES configuration_contract event_bus led telemetry
                       PRIV_REQUIRES esp_timer esp_system heap logger number_transform
                                     simcore_config text_writer value_conditions)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
