idf_component_register(SRCS "src/simcore.cpp"
                       INCLUDE_DIRS "include"
                       PRIV_REQUIRES application_config dashboard delta_time display estimated_lap_time event_bus lap_timer logger performance
                                     simcore_config simhub telemetry usb_cdc)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
