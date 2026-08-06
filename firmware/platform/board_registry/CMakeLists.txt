set(board_driver_dependencies uart usb_cdc)
if(IDF_TARGET STREQUAL "esp32p4")
    list(APPEND board_driver_dependencies guition_jc1060p470c)
else()
    list(APPEND board_driver_dependencies guition_esp32_4848s040 t_display_s3)
endif()

idf_component_register(SRCS "src/board_registry.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES configuration interfaces transport
                       PRIV_REQUIRES ${board_driver_dependencies})

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
