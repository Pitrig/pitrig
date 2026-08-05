idf_component_register(SRCS "src/display_driver.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_gpio esp_lcd
                                     espressif__esp_lcd_panel_io_additions
                                     espressif__esp_lcd_st7701)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
