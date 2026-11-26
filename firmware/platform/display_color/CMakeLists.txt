idf_component_register(SRCS "src/color_science.cpp"
                            "src/display_color.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration_contract interfaces
                       PRIV_REQUIRES heap pitrig_config)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
