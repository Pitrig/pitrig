idf_component_register(SRCS "src/application_configuration.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES dashboard delta_time lap_timer simcore_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
