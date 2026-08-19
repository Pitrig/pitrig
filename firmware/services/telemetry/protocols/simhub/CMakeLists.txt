idf_component_register(SRCS "src/simhub_protocol.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES telemetry
                       PRIV_REQUIRES number_transform)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
