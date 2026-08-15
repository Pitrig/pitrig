idf_component_register(SRCS "src/external_memory_buffer.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES heap)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
