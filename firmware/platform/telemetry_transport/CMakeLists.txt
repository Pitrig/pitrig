set(transport_driver_dependencies)
if(IDF_TARGET STREQUAL "esp32p4")
    list(APPEND transport_driver_dependencies usb_cdc)
else()
    # The fresh-configure dependency graph is built before the S3 board Kconfig
    # choice is loaded. The implementation still instantiates only the
    # selected board's adapters.
    list(APPEND transport_driver_dependencies uart usb_cdc)
endif()

idf_component_register(
    SRCS "src/telemetry_transport_composition.cpp"
    INCLUDE_DIRS "include"
    REQUIRES board_registry configuration_contract transport
             ${transport_driver_dependencies})

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
