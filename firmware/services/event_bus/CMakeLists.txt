idf_component_register(SRCS "src/event_bus.cpp"
                       INCLUDE_DIRS "include")

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
