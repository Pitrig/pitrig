idf_component_register(SRCS "main.cpp"
                       PRIV_REQUIRES core)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
