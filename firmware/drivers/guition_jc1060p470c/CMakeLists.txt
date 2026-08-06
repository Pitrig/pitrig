idf_component_register(SRCS "src/display_driver.cpp" "src/panel.c"
                       INCLUDE_DIRS "include"
                       PRIV_INCLUDE_DIRS "src"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_driver_gpio esp_lcd esp_lcd_jd9165
                                     esp_system)

target_compile_options(${COMPONENT_LIB} PRIVATE
                       $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
