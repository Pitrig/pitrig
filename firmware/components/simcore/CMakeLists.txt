idf_component_register(SRCS "src/logger.cpp"
                            "src/simcore.cpp"
                       INCLUDE_DIRS "include")

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
