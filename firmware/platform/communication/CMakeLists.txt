idf_component_register(SRCS "src/communication_composition.cpp"
                            "src/communication_router.cpp"
                       INCLUDE_DIRS "include"
                       REQUIRES binary_session configuration
                                configuration_control font_asset_control
                                font_assets image_asset_control image_assets
                                simcore_config simhub telemetry transport
                       PRIV_REQUIRES esp_system freertos logger)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
