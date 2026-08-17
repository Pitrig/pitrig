idf_component_register(SRCS "src/gt911_touch.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_gpio esp_driver_i2c esp_lcd
                                     espressif__esp_lcd_touch_gt911)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
