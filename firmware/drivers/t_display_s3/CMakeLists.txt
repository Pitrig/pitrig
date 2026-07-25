idf_component_register(SRCS "src/display_driver.cpp"
                       PRIV_REQUIRES esp_lcd interfaces
                       WHOLE_ARCHIVE)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
