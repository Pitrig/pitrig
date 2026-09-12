idf_component_register(SRCS "src/input.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces
                       PRIV_REQUIRES esp_lvgl_port lvgl__lvgl)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
