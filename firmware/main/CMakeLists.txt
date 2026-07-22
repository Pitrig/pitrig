idf_component_register(SRCS "main.cpp"
                       REQUIRES simcore)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
