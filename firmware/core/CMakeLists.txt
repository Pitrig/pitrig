idf_component_register(SRCS "src/simcore.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES dashboard display logger mock_telemetry performance
                                     simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
