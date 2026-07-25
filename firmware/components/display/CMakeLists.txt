idf_component_register(SRCS "src/display.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES esp_lvgl_port interfaces performance simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
