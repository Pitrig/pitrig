idf_component_register(SRCS "src/crc32.cpp" INCLUDE_DIRS "include")

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
