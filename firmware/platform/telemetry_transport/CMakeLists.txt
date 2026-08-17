set(transport_driver_dependencies)
if(IDF_TARGET STREQUAL "esp32p4")
    # usb_serial_jtag is only instantiated behind SIMCORE_SECOND_TELEMETRY_LINK,
    # but the dependency graph is built before that Kconfig value is loaded.
    list(APPEND transport_driver_dependencies usb_cdc usb_serial_jtag)
else()
    # The fresh-configure dependency graph is built before the S3 board Kconfig
    # choice is loaded. The implementation still instantiates only the
    # selected board's adapters.
    list(APPEND transport_driver_dependencies uart usb_cdc)
endif()

idf_component_register(
    SRCS "src/telemetry_transport_composition.cpp"
    INCLUDE_DIRS "include"
    REQUIRES board_registry configuration_contract simcore_config transport
             ${transport_driver_dependencies})

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
