# Requirements are declared for both settings because the dependency graph is
# expanded before Kconfig is read, and a requirement that appears only in one of
# the two passes would leave the source without its include paths. Only the
# source is conditional, so a product build compiles nothing from here.
set(second_link_sources "")
if(CONFIG_SIMCORE_SECOND_TELEMETRY_LINK)
    set(second_link_sources "src/usb_serial_jtag_transport.cpp")
endif()

idf_component_register(SRCS ${second_link_sources}
                       INCLUDE_DIRS "include"
                       REQUIRES esp_driver_usb_serial_jtag simcore_config
                                transport transport_common
                       PRIV_REQUIRES performance)

if(second_link_sources)
    target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
endif()
