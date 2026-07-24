idf_component_register(SRCS "main.cpp"
                       REQUIRES core t_display_s3)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
