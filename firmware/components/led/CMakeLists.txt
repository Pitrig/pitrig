idf_component_register(SRCS "src/led_font.cpp" "src/led_geometry.cpp"
                            "src/led_output.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES interfaces)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
