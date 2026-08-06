idf_component_register(
    SRCS "src/time_transform.cpp"
    INCLUDE_DIRS "include")

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
