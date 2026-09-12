idf_component_register(SRCS "src/display_driver.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_gpio esp_lcd)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
