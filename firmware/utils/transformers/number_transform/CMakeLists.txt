idf_component_register(
    SRCS "src/number_transform.cpp"
    INCLUDE_DIRS "include"
    REQUIRES text_writer)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
