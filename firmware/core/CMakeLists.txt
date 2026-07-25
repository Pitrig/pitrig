idf_component_register(SRCS "src/simcore.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES dashboard display logger mock_telemetry performance)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)

if(SIMCORE_DEBUG)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE SIMCORE_DEBUG)
endif()
