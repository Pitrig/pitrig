idf_component_register(SRCS "src/simcore.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES display lap_timer logger)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
