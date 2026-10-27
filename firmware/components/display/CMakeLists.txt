idf_component_register(SRCS "src/display.cpp" "src/backlight.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_ledc esp_lvgl_port instrumentation log
                                     pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
