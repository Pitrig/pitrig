idf_component_register(
  SRCS "src/configuration_json.cpp" "src/configuration_validation.cpp"
       "src/configuration_control.cpp" "src/configuration_router.cpp"
       "src/configuration_service.cpp"
  INCLUDE_DIRS "include"
  REQUIRES application_config transport
  PRIV_REQUIRES cjson esp_app_format)

target_compile_options(${COMPONENT_LIB} PRIVATE -std=c++20)
