idf_component_register(SRCS "src/simcore.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES dashboard display logger mock_telemetry)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
