idf_component_register(SRCS "src/display.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES esp_lvgl_port interfaces)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
