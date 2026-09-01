idf_component_register(SRCS "src/value_conditions.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration_contract telemetry
                       PRIV_REQUIRES number_transform)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
