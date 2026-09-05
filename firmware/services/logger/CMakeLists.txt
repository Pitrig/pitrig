idf_component_register(SRCS "src/logger.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES log pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
